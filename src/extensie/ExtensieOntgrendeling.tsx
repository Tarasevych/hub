// Blok «Розблокування розширення» in het extensiepaneel (mcp.tarasevych.com/agents#extension, extensie 0.5, 18.10.2026).
//  - Statuskaart: de 4 staten (STAAT_TEKST), aftellen, mogelijkheden en domeinen, «ШІ-агент підключено» met namen. Altijd live
//    (src/extensie/extensie-live.ts: extensie via de brug + server elke 10 s + PING), nooit herladen nodig.
//  - Ontgrendelen: duur (nooit voorbij het einde van de technische activering), domeinen, lokale agent (alleen lezen) en
//    «Розблокувати з Passkey» → POST uitdaging → passkeyBevestigen (UV) → POST ontgrendeling. Weigering = uitleg (uk/nl) + wat te doen,
//    ook al vóór het klikken als de server zegt dat het niet mag (recht.magOntgrendelen === false).
//  - «Відкликати зараз»: zonder passkey, direct.
// ?ontgrendelen=1 (bijv. vanuit de pop-up van de extensie) → naar dit blok scrollen en de focus erop zetten.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { KeyRound, Lock, LockOpen, Bot, ShieldOff } from 'lucide-react';
import { api, ApiError } from '../platform/client';
import { passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import { openTechVenster, techBody, useTech } from '../tech/tech-opslag';
import HulpVraag from '../hulp/HulpVraag';
import { versionAtLeast } from '../extensie-toestand';
import {
  ADMIN_HOSTS_STANDAARD, ADMIN_HOSTS_TOEGESTAAN, DUUR_KEUZES, MAX_MINUTEN, MIN_EXTENSIE_VERSIE, STAAT_TEKST, STANDAARD_MINUTEN, WEIGER_UITLEG,
  isWeigercode, weigerUitleg, type BrowserCap, type ExtensieAgentStatus, type ExtensieStaat,
} from '../../shared/extensie-ontgrendeling';
import { eindeWeergave } from '../../shared/extensie-matrix';
import { weigeringZin } from '../../shared/weigering-tekst';
import { extensieLive, restTekst, useExtensieLive, type ExtensieLive, type ExtensieLiveStore, type Slot } from './extensie-live';
import './ExtensieOntgrendeling.css';
import '../agenten/agenten-toegang-maquette.css';

type Tr = (uk: string, nl: string) => string;
type Tekst2 = { uk: string; nl: string };
export type Weigering = Tekst2 & { code: string; actie?: Tekst2 & { url: string } };

export const CAP_TEKST: Readonly<Record<BrowserCap, readonly [string, string]>> = Object.freeze({
  'browser.read': ['читання сторінок', 'pagina’s lezen'],
  'browser.navigate': ['перехід між сторінками', 'navigeren'],
  'browser.interact': ['натискання й введення', 'klikken en invoeren'],
  'browser.screenshot': ['знімки екрана', 'schermafbeeldingen'],
  'browser.console': ['консоль і мережа', 'console en netwerk'],
  'browser.debug': ['налагодження (DevTools)', 'debuggen (DevTools)'],
  'browser.script': ['скрипти (evaluate_script)', 'scripts (evaluate_script)'],
});

// ------------------------------------------------------------------------------------------------ acties (los testbaar)
export type OntgrendelDeps = {
  post: (url: string, data: Record<string, unknown>) => Promise<{ data: unknown }>;
  bevestig: (pk: AssertieOpties) => Promise<unknown>;
  body: () => Record<string, unknown>;
  store: () => ExtensieLiveStore;
  /** Step-up-venster openen; true = bevestigd. Standaard niet nodig: client.ts (api.post) doet het zelf en herhaalt één keer. */
  stapOp?: (body: Record<string, unknown>) => Promise<boolean>;
};
const STANDAARD_DEPS: OntgrendelDeps = { post: (u, d) => api.post(u, d), bevestig: (pk) => passkeyBevestigen(pk), body: () => techBody(), store: () => extensieLive() };
let deps: OntgrendelDeps = STANDAARD_DEPS;
/** Voor tests: fetch/passkey/body/store vervangen (null = standaard). */
export function zetOntgrendelDeps(d: Partial<OntgrendelDeps> | null): void { deps = d ? { ...STANDAARD_DEPS, ...d } : STANDAARD_DEPS; }

const eigenSite = (u: unknown): u is string => { try { const x = new URL(String(u)); return x.protocol === 'https:' && (x.hostname === 'tarasevych.com' || x.hostname.endsWith('.tarasevych.com')); } catch { return false; } };
const isTekst2 = (v: unknown): v is Tekst2 => !!v && typeof (v as Tekst2).uk === 'string' && typeof (v as Tekst2).nl === 'string' && (v as Tekst2).uk.length > 0 && (v as Tekst2).nl.length > 0;
/** Weigering van de server (403/409 {error, uitleg, actie?}) of van de passkey-dialoog → uitleg in gewone taal. Links alleen naar de eigen site. */
export function weigeringVan(e: unknown, ruimte?: 'prive' | 'technisch'): Weigering {
  const naam = (e as { name?: unknown })?.name;
  if (naam === 'NotAllowedError' || naam === 'AbortError' || naam === 'TimeoutError') {
    return { code: 'PASSKEY_GEANNULEERD', uk: 'Підтвердження passkey скасовано або час минув. Нічого не відкрито.', nl: 'De passkey-bevestiging is geannuleerd of verlopen. Er is niets geopend.' };
  }
  const data = (e instanceof ApiError ? e.response.data : (e as { response?: { data?: unknown } })?.response?.data) as Record<string, unknown> | null | undefined;
  const code = String(data?.error || (e as Error)?.message || 'FOUT');
  const vast = isWeigercode(code) ? weigerUitleg(code, ruimte) : null;
  const uitleg = isTekst2(data?.uitleg) ? { uk: String(data!.uitleg.uk).slice(0, 400), nl: String(data!.uitleg.nl).slice(0, 400) } : vast ? { uk: vast.uk, nl: vast.nl } : null;
  const a = data?.actie as (Tekst2 & { url?: unknown }) | undefined;
  const actie = a && isTekst2(a) && eigenSite(a.url) ? { uk: a.uk.slice(0, 80), nl: a.nl.slice(0, 80), url: String(a.url) } : vast?.actie;
  if (uitleg) return { code, ...uitleg, ...(actie ? { actie } : {}) };
  if (code === 'NETWORK_ERROR') return { code, uk: 'Немає зв’язку із сервером. Перевірте мережу й спробуйте ще раз.', nl: 'Geen verbinding met de server. Controleer het netwerk en probeer opnieuw.' };
  // SEC-002 (slot «u»): bekende weigeringen (rol «лише перегляд», server bezet …) — één tekst voor de hele site, shared/weigering-tekst.ts.
  const bekendUk = weigeringZin('uk', code), bekendNl = weigeringZin('nl', code);
  if (bekendUk && bekendNl) return { code, uk: bekendUk, nl: bekendNl };
  return { code, uk: `Не вдалося (${code}). Нічого не змінено.`, nl: `Mislukt (${code}). Er is niets gewijzigd.` };
}

/** 0.7.0: `termijn` (id uit ONTGRENDEL_TERMIJNEN, shared/extensie-matrix.ts) gaat vóór `minuten`. */
export type OntgrendelInvoer = { agentId: string; minuten: number; domeinen: string[]; lokaal: boolean; termijn?: string | null };
export type Uitkomst = { ok: true; ontgrendeling: ExtensieAgentStatus['ontgrendeling']; verzonden: boolean } | { ok: false; weigering: Weigering };

/** Uitdaging → passkey (UV) → ontgrendeling. Bij succes meteen in de live-store (geen herladen), daarna opnieuw bij de server. */
export async function ontgrendelen(inv: OntgrendelInvoer, opVoortgang?: (stap: 'uitdaging' | 'passkey' | 'bevestigen') => void): Promise<Uitkomst> {
  const store = deps.store();
  try {
    opVoortgang?.('uitdaging');
    const u = (await deps.post('/api/owner/agents/ontgrendeling/uitdaging', { ...deps.body(), agentId: inv.agentId, minuten: inv.minuten, domeinen: inv.domeinen, lokaal: inv.lokaal, ...(inv.termijn ? { termijn: inv.termijn } : {}) })).data as { uitdagingId?: unknown; publicKey?: AssertieOpties };
    if (typeof u?.uitdagingId !== 'string' || !u.publicKey) return { ok: false, weigering: weigeringVan(new ApiError(500, '', { error: 'UITDAGING_ONGELDIG' }, '')) };
    opVoortgang?.('passkey');
    const assertie = await deps.bevestig(u.publicKey);
    opVoortgang?.('bevestigen');
    const r = (await deps.post('/api/owner/agents/ontgrendeling', { ...deps.body(), agentId: inv.agentId, uitdagingId: u.uitdagingId, assertie })).data as { ontgrendeling?: ExtensieAgentStatus['ontgrendeling']; verzonden?: unknown };
    const o = r?.ontgrendeling ?? null;
    if (o) store.zetAgent(inv.agentId, { ontgrendeling: o, staat: 'ontgrendeld' });
    void store.vernieuw().catch(() => undefined);
    return { ok: true, ontgrendeling: o, verzonden: r?.verzonden === true };
  } catch (e) {
    void store.vernieuw().catch(() => undefined);
    return { ok: false, weigering: weigeringVan(e) };
  }
}

// ------------------------------------------------------------------------------------------------ slot «як користувач» (0.6)
export type PriveInvoer = { agentId: string; dagen: number; domeinen: string[]; lokaal: boolean; termijn?: string | null };
/** Hoeveel keer we na STEP_UP_REQUIRED opnieuw proberen (na het venster «Підтвердіть доступ»). */
const STAP_OP_HERHALINGEN = 1;
const isStapOp = (e: unknown) => {
  const d = (e instanceof ApiError ? e.response.data : (e as { response?: { data?: unknown } })?.response?.data) as { error?: unknown } | null | undefined;
  const c = String(d?.error || (e as Error)?.message || '');
  return c === 'STEP_UP_REQUIRED' || c === 'STEP_UP_STRONG_REQUIRED';
};
/**
 * Ontgrendelen «як користувач»: POST /api/owner/agents/ontgrendeling/prive met de sessie. Vraagt de server een step-up
 * (403 STEP_UP_REQUIRED), dan opent het bestaande venster «Підтвердіть доступ» (client.ts doet dat zelf bij api.post; met
 * vervangen deps doet `stapOp` het) en proberen we één keer opnieuw. Geen passkey-eis: elke methode van de step-up telt.
 */
export async function ontgrendelenPrive(inv: PriveInvoer): Promise<Uitkomst> {
  const store = deps.store();
  const body = () => ({ ...deps.body(), agentId: inv.agentId, dagen: inv.dagen, domeinen: inv.domeinen, lokaal: inv.lokaal, ...(inv.termijn ? { termijn: inv.termijn } : {}) });
  try {
    let r: { data: unknown } | null = null;
    for (let poging = 0; ; poging++) {
      try { r = await deps.post('/api/owner/agents/ontgrendeling/prive', body()); break; }
      catch (e) {
        if (!isStapOp(e) || poging >= STAP_OP_HERHALINGEN || !deps.stapOp || !(await deps.stapOp(body()))) throw e;
      }
    }
    const d = (r?.data ?? null) as { ontgrendeling?: ExtensieAgentStatus['ontgrendeling']; verzonden?: unknown } | null;
    const o = d?.ontgrendeling ?? null;
    if (o) store.zetAgent(inv.agentId, { ontgrendeling: o, staat: 'ontgrendeld' });
    void store.vernieuw().catch(() => undefined);
    return { ok: true, ontgrendeling: o, verzonden: d?.verzonden === true };
  } catch (e) {
    void store.vernieuw().catch(() => undefined);
    return { ok: false, weigering: weigeringVan(e, 'prive') };
  }
}

/** «Відкликати зараз»: geen passkey. Meteen vergrendeld tonen; de server duwt {t:'vergrendel'} naar de extensie. */
export async function intrekken(agentId: string, gid?: string): Promise<Uitkomst> {
  const store = deps.store();
  try {
    await deps.post('/api/owner/agents/ontgrendeling/intrekken', { ...deps.body(), agentId, ...(gid ? { gid } : {}) });
    store.zetAgent(agentId, { ontgrendeling: null, staat: 'vergrendeld', ai: { verbonden: false, agenten: [] } });
    void store.vernieuw().catch(() => undefined);
    return { ok: true, ontgrendeling: null, verzonden: true };
  } catch (e) {
    void store.vernieuw().catch(() => undefined);
    return { ok: false, weigering: weigeringVan(e) };
  }
}

/** Duurkeuzes die binnen de technische activering vallen (servertijd). Geen keuze past maar er is nog ≥ 1 min → die rest. */
export function duurKeuzes(activatieTot: number | null, nuServer: number): number[] {
  const rest = activatieTot ? Math.floor((activatieTot - nuServer) / 60000) : MAX_MINUTEN;
  const max = Math.min(MAX_MINUTEN, rest);
  const k = DUUR_KEUZES.filter((d) => d <= max);
  return k.length ? k : max >= 1 ? [max] : [];
}

/** Waarom ontgrendelen nu (nog vóór klikken) niet kan, of null. */
export function blokkade(live: ExtensieLive): Weigering | null {
  if (live.fout === 'NIET_INGELOGD') return { code: 'NIET_INGELOGD', ...WEIGER_UITLEG.NIET_INGELOGD };
  if (live.recht && live.recht.magOntgrendelen === false) {
    const code = live.recht.code && isWeigercode(live.recht.code) ? live.recht.code : 'GEEN_TECH_PROFIEL';
    return { code, ...WEIGER_UITLEG[code] };
  }
  if (live.dezeBrowser && live.versie && !versionAtLeast(live.versie, MIN_EXTENSIE_VERSIE)) return { code: 'EXTENSIE_TE_OUD', ...WEIGER_UITLEG.EXTENSIE_TE_OUD };
  return null;
}

const tijd = (ms: number, uk: boolean) => new Date(ms).toLocaleTimeString(uk ? 'uk-UA' : 'nl-NL', { hour: '2-digit', minute: '2-digit' });
const staatVan = (s: ExtensieStaat | 'onbekend'): ExtensieStaat => (s === 'onbekend' ? 'vergrendeld' : s);
const leesVraag = () => {
  if (typeof location === 'undefined') return false;
  const zoek = new URLSearchParams(location.search);
  const hash = location.hash.includes('?') ? new URLSearchParams(location.hash.split('?')[1]) : null;
  return zoek.get('ontgrendelen') === '1' || hash?.get('ontgrendelen') === '1';
};

// ------------------------------------------------------------------------------------------------ weergave
/** Technisch slot: passkey-ontgrendeling (0.5). `ruimte='technisch'` (hub, 0.6) = alleen koppelingen van het technische slot. */
export default function ExtensieOntgrendeling({ tr, agentId, ruimte }: { tr: Tr; agentId?: string; ruimte?: Slot }) {
  const uk = tr('uk', 'nl') === 'uk';
  const live = useExtensieLive(agentId, ruimte);
  const tech = useTech();
  const kopId = useId();
  const rootRef = useRef<HTMLElement | null>(null);
  const kopRef = useRef<HTMLHeadingElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const [nu, setNu] = useState(() => Date.now());
  const [minuten, setMinuten] = useState(STANDAARD_MINUTEN);
  const [domeinen, setDomeinen] = useState<string[]>(() => [...ADMIN_HOSTS_STANDAARD]);
  const [lokaal, setLokaal] = useState(false);
  const [bezig, setBezig] = useState<'' | 'uitdaging' | 'passkey' | 'bevestigen' | 'intrekken'>('');
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string; weigering?: Weigering } | null>(null);

  const staat = staatVan(live.staat);
  const o = live.ontgrendeling;
  const nuServer = nu + live.scheef;
  const keuzes = useMemo(() => duurKeuzes(live.recht?.activatieTot ?? null, nuServer), [live.recht?.activatieTot, Math.floor(nuServer / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const gekozen = keuzes.includes(minuten) ? minuten : keuzes.includes(STANDAARD_MINUTEN) ? STANDAARD_MINUTEN : keuzes[keuzes.length - 1] ?? 0;
  const eindKeuze = gekozen ? Math.min(nuServer + gekozen * 60000, live.recht?.activatieTot ?? Infinity) : 0;
  const blok = blokkade(live);
  const open = staat === 'ontgrendeld' || staat === 'agent';

  // Aftellen: elke seconde zolang er een ontgrendeling loopt, anders elke 30 s (voor «tot wanneer»).
  useEffect(() => { const i = window.setInterval(() => setNu(Date.now()), open ? 1000 : 30_000); return () => window.clearInterval(i); }, [open]);
  // Technische activering begonnen/geëindigd/verlengd → recht opnieuw vragen.
  useEffect(() => { void extensieLive().vernieuw().catch(() => undefined); }, [tech.activatie?.id, tech.activatie?.eind]);
  // ?ontgrendelen=1 → hierheen.
  useEffect(() => {
    if (agentId || !leesVraag()) return;
    const h = window.setTimeout(() => { rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); kopRef.current?.focus({ preventScroll: true }); }, 50);
    return () => window.clearTimeout(h);
  }, []);

  if (!live.heeftBrowser) {
    return (
      <section ref={rootRef} className='eo' id={agentId ? `extensie-ontgrendeling-${agentId}` : 'extensie-ontgrendeling'} data-eo-staat='niet-gekoppeld' aria-labelledby={kopId}>
        <h3 id={kopId} ref={kopRef} tabIndex={-1}>{tr('Розблокування розширення', 'Ontgrendelen van de extensie')}</h3>
        <p className='eo-meta' role='status'>{live.geladen ? tr('Спершу встановіть і підключіть розширення (кроки вище). Без підключення розширення завжди заблоковане.', 'Installeer en koppel eerst de extensie (stappen hierboven). Zonder koppeling is de extensie altijd vergrendeld.') : tr('Перевіряю стан розширення…', 'Stand van de extensie controleren…')}</p>
      </section>
    );
  }

  const doeOntgrendelen = async () => {
    if (bezig || !live.agentId || blok || !gekozen || !domeinen.length) return;
    setMelding(null);
    const r = await ontgrendelen({ agentId: live.agentId, minuten: gekozen, domeinen, lokaal }, (s) => setBezig(s));
    setBezig('');
    if (r.ok) {
      setMelding({ ok: true, tekst: r.verzonden ? tr('Доступ відкрито. Розширення вже отримало підписаний дозвіл.', 'Toegang open. De extensie heeft de ondertekende ontgrendeling al ontvangen.') : tr('Доступ відкрито. Розширення отримає дозвіл, щойно з’єднається із сервером.', 'Toegang open. De extensie krijgt de ontgrendeling zodra ze met de server verbindt.') });
      window.requestAnimationFrame?.(() => statusRef.current?.focus({ preventScroll: true }));
    } else setMelding({ ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
  };
  const doeIntrekken = async () => {
    if (bezig || !live.agentId) return;
    setBezig('intrekken'); setMelding(null);
    const r = await intrekken(live.agentId, o?.gid || undefined);
    setBezig('');
    setMelding(r.ok ? { ok: true, tekst: tr('Доступ відкликано. Розширення заблоковане.', 'Toegang ingetrokken. De extensie is vergrendeld.') } : { ok: false, tekst: uk ? r.weigering.uk : r.weigering.nl, weigering: r.weigering });
  };

  const actieKnop = (w: Weigering) => w.code === 'TECH_NIET_ACTIEF'
    // De activering is aan DIT tabblad gebonden: hier activeren, niet in een ander tabblad.
    ? <button type='button' className='eo-actie' onClick={() => openTechVenster('activeren')} data-eo-actie={w.code}>{uk ? WEIGER_UITLEG.TECH_NIET_ACTIEF.actie!.uk : WEIGER_UITLEG.TECH_NIET_ACTIEF.actie!.nl}</button>
    : w.actie ? <a className='eo-actie' href={w.actie.url} data-eo-actie={w.code}>{uk ? w.actie.uk : w.actie.nl}</a> : null;
  const uitlegBlok = (w: Weigering, rol: 'alert' | 'note') => (
    <div className='eo-weigering' role={rol === 'alert' ? 'alert' : undefined} data-eo-weigering={w.code}>
      <ShieldOff aria-hidden='true' /><p>{uk ? w.uk : w.nl}</p>{actieKnop(w)}
    </div>
  );
  const rest = o ? Math.max(0, o.eind - nuServer) : 0;
  const stapTekst = bezig === 'uitdaging' ? tr('Готую запит…', 'Verzoek voorbereiden…') : bezig === 'passkey' ? tr('Підтвердьте passkey на пристрої…', 'Bevestig de passkey op uw apparaat…') : bezig === 'bevestigen' ? tr('Перевіряю…', 'Controleren…') : '';
  const knopUit = !!bezig || !!blok || !gekozen || !domeinen.length || !live.agentId;

  return (
    <section ref={rootRef} className='eo' id={agentId ? `extensie-ontgrendeling-${agentId}` : 'extensie-ontgrendeling'} data-eo-staat={staat} data-eo-bron={live.bron} aria-labelledby={kopId}>
      <h3 id={kopId} ref={kopRef} tabIndex={-1}>{tr('Розблокування розширення', 'Ontgrendelen van de extensie')} <HulpVraag k='extensie.ontgrendeling' uk={uk} label={tr('Розблокування', 'Ontgrendelen')} /></h3>

      <div ref={statusRef} tabIndex={-1} className={`eo-kaart is-${staat}`} role='status' aria-live='polite' aria-atomic='true' data-eo-kaart='1'>
        <span className='eo-icoon' aria-hidden='true'>{staat === 'agent' ? <Bot /> : open ? <LockOpen /> : <Lock />}</span>
        <div className='eo-kaart-tekst'>
          <b data-eo-staattekst='1'>{uk ? STAAT_TEKST[staat][0] : STAAT_TEKST[staat][1]}</b>
          {open && o ? <span className='eo-rest' data-eo-rest={Math.ceil(rest / 60000)}>{(() => { const w = eindeWeergave(o.eindeSoort, { uk: `ще ${restTekst(rest, true)} · до ${tijd(o.eind - live.scheef, true)}`, nl: `nog ${restTekst(rest, false)} · tot ${tijd(o.eind - live.scheef, false)}` }, tijd(o.eind - live.scheef, uk)); return uk ? w.uk : w.nl; })()}</span> : null}
          {!open && staat === 'vergrendeld' ? <span className='eo-meta'>{tr('ШІ не може нічого робити в цьому браузері, розширення нічого не збирає.', 'De AI kan niets in deze browser, de extensie verzamelt niets.')}</span> : null}
          {!live.online ? <span className='eo-meta'>{tr('Розширення зараз не з’єднане із сервером.', 'De extensie is nu niet met de server verbonden.')}</span> : null}
        </div>
      </div>
      {open && o ? (
        <dl className='eo-details' data-eo-details='1'>
          <dt>{tr('Можливості', 'Mogelijkheden')}</dt><dd>{o.caps.length ? o.caps.map((c) => <span key={c} className='eo-chip'>{uk ? CAP_TEKST[c]?.[0] ?? c : CAP_TEKST[c]?.[1] ?? c}</span>) : '—'}</dd>
          <dt>{tr('Сторінки', 'Pagina’s')}</dt><dd>{o.domeinen.map((d) => <code key={d} className='eo-chip'>{d}</code>)}</dd>
          <dt>{tr('Локальний агент', 'Lokale agent')}</dt><dd>{o.lokaal ? (live.lokaal.verbonden ? tr('дозволено (лише читання) · підключено', 'toegestaan (alleen lezen) · verbonden') : tr('дозволено (лише читання)', 'toegestaan (alleen lezen)')) : tr('не дозволено', 'niet toegestaan')}</dd>
          {live.ai.verbonden ? <><dt>{tr('ШІ-агент підключено', 'AI-agent verbonden')}</dt><dd data-eo-ai='1'>{live.ai.agenten.length ? live.ai.agenten.map((a) => <span key={a.naam} className='eo-chip'>{a.naam}</span>) : '—'}</dd></> : null}
        </dl>
      ) : null}
      {open ? (
        <div className='eo-knoppen'>
          <button type='button' className='eo-knop is-gevaar' onClick={() => void doeIntrekken()} disabled={!!bezig} aria-busy={bezig === 'intrekken' || undefined} data-eo-knop='intrekken'>
            <Lock aria-hidden='true' />{bezig === 'intrekken' ? tr('Відкликаю…', 'Intrekken…') : tr('Відкликати зараз', 'Nu intrekken')}
          </button>
          <HulpVraag k='extensie.intrekken' uk={uk} label={tr('Відкликати', 'Intrekken')} />
        </div>
      ) : null}

      <form className='eo-form' onSubmit={(e) => { e.preventDefault(); void doeOntgrendelen(); }} data-eo-form='1' aria-describedby={blok ? `${kopId}-blok` : undefined}>
        <p className='eo-lead'>{open ? tr('Нове розблокування замінить поточне.', 'Een nieuwe ontgrendeling vervangt de huidige.') : tr('Розблокувати може лише користувач із технічним профілем, увімкненим у цій вкладці, своїм власним passkey.', 'Alleen een gebruiker met een technisch profiel dat in dit tabblad aan staat kan ontgrendelen, met de eigen passkey.')}</p>
        {blok ? <div id={`${kopId}-blok`}>{uitlegBlok(blok, 'note')}</div> : null}
        <label className='eo-veld'>
          <span>{tr('Тривалість', 'Duur')} <HulpVraag k='extensie.duur' uk={uk} label={tr('Тривалість', 'Duur')} /></span>
          <select data-hulp='extensie.duur' value={gekozen || ''} disabled={!keuzes.length || !!bezig} onChange={(e) => setMinuten(Number(e.target.value))} data-eo-duur='1'>
            {keuzes.map((d) => <option key={d} value={d}>{restTekst(d * 60000, uk)}</option>)}
          </select>
          <small data-eo-tot='1'>{eindKeuze ? tr(`діятиме до ${tijd(eindKeuze - live.scheef, true)}`, `geldt tot ${tijd(eindKeuze - live.scheef, false)}`) : tr('немає часу: технічна активація закінчується', 'geen tijd: de technische activering loopt af')}
            {live.recht?.activatieTot ? tr(` · технічна активація до ${tijd(live.recht.activatieTot - live.scheef, true)}`, ` · technische activering tot ${tijd(live.recht.activatieTot - live.scheef, false)}`) : ''}</small>
        </label>
        <fieldset className='eo-domeinen' disabled={!!bezig}>
          <legend>{tr('Сторінки сайту', 'Pagina’s van de site')} <HulpVraag k='extensie.domeinen' uk={uk} label={tr('Сторінки', 'Pagina’s')} /></legend>
          {ADMIN_HOSTS_TOEGESTAAN.map((h) => (
            <label key={h} className='eo-vink'>
              <input data-hulp='extensie.domeinen' type='checkbox' checked={domeinen.includes(h)} onChange={(e) => setDomeinen((d) => (e.target.checked ? [...d, h] : d.filter((x) => x !== h)))} data-eo-domein={h} />
              <code>{h}</code>
            </label>
          ))}
          {!domeinen.length ? <small className='eo-fout'>{tr('Оберіть хоча б одну сторінку.', 'Kies minstens één pagina.')}</small> : null}
        </fieldset>
        <label className='eo-vink eo-lokaal'>
          <input data-hulp='extensie.lokaal' type='checkbox' checked={lokaal} disabled={!!bezig} onChange={(e) => setLokaal(e.target.checked)} data-eo-lokaal='1' />
          <span>{tr('Дозволити локального агента (лише читання)', 'Lokale agent toestaan (alleen lezen)')}</span> <HulpVraag k='extensie.lokaal' uk={uk} label={tr('Локальний агент', 'Lokale agent')} />
        </label>
        {lokaal ? (
          <details className='eo-meta' id={agentId ? `extension-lokaal-${agentId}` : undefined}>
            <summary>{tr('Як підключити локального ШІ-агента (Native Messaging)', 'Lokale AI-agent koppelen (Native Messaging)')}</summary>
            <ol>
              <li><a href='https://mcp.tarasevych.com/downloads/mijn-ruimte-extensie-native.zip'>{tr('Завантажте mijn-ruimte-extensie-native.zip', 'Download mijn-ruimte-extensie-native.zip')}</a>{tr(' і розпакуйте.', ' en pak uit.')}</li>
              <li>{tr('Windows: ', 'Windows: ')}<code>powershell -ExecutionPolicy Bypass -File .\extensie-native\installeer-windows.ps1 -ClaudeDesktop</code>{tr('; Linux/macOS: ', '; Linux/macOS: ')}<code>bash extensie-native/installeer-unix.sh</code></li>
              <li>{tr('Перезапустіть браузер, увімкніть «Локальний ШІ-агент (Native Messaging)» у налаштуваннях розширення і розблокуйте тут із цією позначкою.', 'Herstart de browser, zet «Native Messaging» aan in de extensie-opties en ontgrendel hier met dit vinkje.')}</li>
            </ol>
          </details>
        ) : null}
        {live.recht?.caps?.length ? <p className='eo-meta'>{tr('Ваші ролі дадуть: ', 'Uw rollen geven: ')}{live.recht.caps.map((c) => (uk ? CAP_TEKST[c]?.[0] : CAP_TEKST[c]?.[1]) ?? c).join(', ')}</p> : null}
        <div className='eo-knoppen'>
          <button type='submit' className='eo-knop is-hoofd' disabled={knopUit} aria-disabled={knopUit || undefined} aria-busy={(!!bezig && bezig !== 'intrekken') || undefined} data-eo-knop='ontgrendelen'>
            <KeyRound aria-hidden='true' />{stapTekst || tr('Розблокувати з Passkey', 'Ontgrendelen met passkey')}
          </button>
        </div>
      </form>
      <div aria-live='assertive' className='eo-melding-plek'>
        {melding ? (melding.ok ? <p className='eo-melding is-ok' role='status' data-eo-melding='ok'>{melding.tekst}</p> : melding.weigering ? uitlegBlok(melding.weigering, 'alert') : <p className='eo-melding' role='alert'>{melding.tekst}</p>) : null}
      </div>
    </section>
  );
}
