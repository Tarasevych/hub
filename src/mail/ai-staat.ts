// Welke privé-AI-agent er is voor de post (pakket 3 «Adaptive Mail Canvas», 24.10.2026). Eén verzoek per pagina en context
// (`/api/owner/mail/ai-vertaling/state`, dezelfde bron als de ШІ-panel src/mail/AiVertalingBalk.tsx), gedeeld door het blok
// «Що від вас потрібно?», de vertaalstrook, «Порівняти» en «Звідки це?». Geen agent = die onderdelen zeggen dat eerlijk en sturen
// niets weg; het eenvoudige ontleden werkt altijd (in de browser, zonder model).
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { MOTOR_AUTO, MOTOR_VOORKEUR_SLEUTEL } from '../../shared/mail-ai-motor';
import { agentKanPost, AI_TOEGANG_HREF, STANDAARD_AI_VERTALING_INSTELLINGEN, type AiVertalingAgentInfo, type AiVertalingInstellingen, type AiVertalingRunResponse } from '../../shared/ai-vertaling';

export type AiStaat = { geladen: boolean; agent: AiVertalingAgentInfo | null; instellingen: AiVertalingInstellingen };
const LEEG: AiStaat = { geladen: false, agent: null, instellingen: STANDAARD_AI_VERTALING_INSTELLINGEN };
const cache = new Map<string, Promise<AiStaat>>();
/** De laatst geladen staat (welke context ook): voor onderdelen zonder eigen context, zoals «Вигляд → Мова листа». */
let laatste: AiStaat | null = null;
const luisteraars = new Set<(s: AiStaat) => void>();
const sleutelVan = (c: Record<string, string>) => `${c.service || ''}\u001f${c.tabContext || ''}\u001f${c.sourceOrigin || ''}`;

/** De agent die de post mag lezen (de standaardagent uit de instellingen, anders de eerste met mail.read), of null. */
export function laadAiStaat(context: Record<string, string>): Promise<AiStaat> {
  const k = sleutelVan(context);
  let p = cache.get(k);
  if (!p) {
    p = api.post('/api/owner/mail/ai-vertaling/state', { ...context }).then((res) => {
      const data = (res.data || {}) as { agents?: AiVertalingAgentInfo[]; settings?: AiVertalingInstellingen };
      // MAILAI-001: лише агент, якого сайт справді може запустити (є ключ API), — інакше кнопки ШІ «працюють» лише на вигляд.
      const agents = (Array.isArray(data.agents) ? data.agents : []).filter((a) => agentKanPost(a));
      const instellingen = data.settings || STANDAARD_AI_VERTALING_INSTELLINGEN;
      const agent = agents.find((a) => a.id === instellingen.defaultAgentId) || agents[0] || null;
      return { geladen: true, agent, instellingen };
    }, () => ({ geladen: true, agent: null, instellingen: STANDAARD_AI_VERTALING_INSTELLINGEN }));
    cache.set(k, p);
    laatsteContext = { ...context };
    void p.then((s) => {
      laatste = s;
      for (const f of luisteraars) f(s);
      // een mislukte poging niet onthouden: de volgende brief mag het opnieuw proberen (setTimeout van de omgeving: ook zonder window)
      if (!s.agent) setTimeout(() => cache.delete(k), 60_000);
    });
  }
  return p;
}

export function useAiStaat(context: Record<string, string>): AiStaat {
  const [staat, setStaat] = useState<AiStaat>(LEEG);
  useEffect(() => {
    let actief = true;
    void laadAiStaat(context).then((s) => { if (actief) setStaat(s); });
    return () => { actief = false; };
  }, [context.service, context.tabContext, context.sourceOrigin]);
  return staat;
}

/** De laatst geladen staat, of null zolang er nog niets geladen is (dan weet het onderdeel het niet — en zegt het niets stelligs). */
export function useLaatsteAiStaat(): AiStaat | null {
  const [staat, setStaat] = useState<AiStaat | null>(laatste);
  useEffect(() => {
    luisteraars.add(setStaat);
    setStaat(laatste);
    return () => { luisteraars.delete(setStaat); };
  }, []);
  return staat;
}

/** Alleen voor tests: de gedeelde staat vergeten. */
export function vergeetAiStaat() { cache.clear(); laatste = null; laatsteContext = null; }

let laatsteContext: Record<string, string> | null = null;
/**
 * MAILAI-001: увімкнути/вимкнути панель «ШІ-аналіз і переклад» над листами (налаштування облікового запису, не пристрою). Одразу
 * оновлює всі відкриті частини (панель, «Вигляд»), потім зберігає на сервері; при збої повертає попередній стан і кидає помилку.
 * Paneel boven de brief aan/uit: meteen overal zichtbaar, daarna op de server bewaard; bij een fout terug naar de vorige stand.
 */
export async function zetAiBalkTonen(aan: boolean, context: Record<string, string> = laatsteContext || { service: 'mail' }): Promise<void> {
  const vorige = laatste;
  const pas = (v: boolean) => {
    const basis = laatste || { geladen: true, agent: null, instellingen: STANDAARD_AI_VERTALING_INSTELLINGEN };
    laatste = { ...basis, instellingen: { ...basis.instellingen, balkTonen: v } };
    for (const [k, p] of cache) cache.set(k, p.then((s) => ({ ...s, instellingen: { ...s.instellingen, balkTonen: v } })));
    for (const f of luisteraars) f(laatste);
  };
  pas(aan);
  try {
    await api.post('/api/owner/mail/ai-vertaling/settings', { ...context, balkTonen: aan });
  } catch (err) {
    pas(vorige?.instellingen.balkTonen === true);
    throw err;
  }
}

/** MAILAI-001: «/ai» bestaat op geen enkele host (404 op mail.*). Het echte adres: rechten → «Підключення ШІ → Доступи», sleutels → «Сховище ключів». */
export function aiHrefOplossen(href: string | undefined | null, soort: 'toegang' | 'sleutels' | 'extensie' = 'toegang'): string {
  const h = String(href || '');
  if (h && h !== AI_TOEGANG_HREF && !h.startsWith('/ai/') && !h.startsWith('/ai#') && !h.startsWith('/ai?')) return h;
  try {
    const taal = typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' : 'uk';
    // Rechtstreeks uit de runtime (public/canonical-service.js) i.p.v. src/canoniek-navigatie: dat module gooit bij het laden zonder
    // venster (tests). Domeinen komen uit de eigen installatie (BYOS), niet hard uit tarasevych.com.
    const rt = (globalThis as { __TSV_CANONICAL_SERVICE__?: { canonicalUrl: (s: string, t: string, l: string, o: { explicitTab: boolean }) => string } }).__TSV_CANONICAL_SERVICE__;
    if (!rt) throw new Error('geen runtime');
    return soort === 'sleutels' ? rt.canonicalUrl('api', 'vault', taal, { explicitTab: true }) : `${rt.canonicalUrl('mcp', 'agents', taal, { explicitTab: true })}#${soort}`;
  } catch {
    return soort === 'sleutels' ? 'https://api.tarasevych.com/kluis' : `https://mcp.tarasevych.com/agenten#${soort}`;
  }
}

export type AiFout = { code: string; uk: string; nl: string; href: string };
/** Een weigering of fout van `/ai-vertaling/run` als eerlijke tekst (nooit een verzonnen resultaat). */
export function aiFoutVan(err: unknown): AiFout {
  const e = err as { response?: { status?: number; data?: Record<string, unknown> }; data?: Record<string, unknown> };
  const b = (e?.response?.data || e?.data || {}) as Record<string, unknown>;
  const code = String(b.error || (e?.response?.status === 403 ? 'ACCESS_DENIED' : 'AI_FOUT'));
  return {
    code,
    uk: String(b.messageUk || '') || 'Не вдалося виконати запит до ШІ-агента. Лист не змінено.',
    nl: String(b.messageNl || '') || 'Het verzoek aan de AI-agent is niet gelukt. Het bericht is niet veranderd.',
    href: aiHrefOplossen(String(b.actionHref || '')),
  };
}

/** Eén aanroep van `/ai-vertaling/run` met de context van de pagina erbij. */
export async function aiRun(context: Record<string, string>, body: Record<string, unknown>): Promise<AiVertalingRunResponse> {
  const res = await api.post('/api/owner/mail/ai-vertaling/run', { ...context, ...body });
  return res.data as AiVertalingRunResponse;
}

// MAILAI-002: «Сховати зараз» ≠ «Вимкнути зовсім». Сховати — лише до закриття цієї вкладки (sessionStorage), щоб не відволікало;
// налаштування облікового запису не змінюється. Verbergen voor deze sessie (tabblad) — de accountinstelling blijft zoals ze is.
const SESSIE_SLEUTEL = 'mr-ai-balk-sessie-verborgen-v1';
const SESSIE_GEBEURTENIS = 'mail:ai-balk-sessie';
export function balkSessieVerborgen(): boolean {
  try { return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSIE_SLEUTEL) === '1'; } catch { return false; }
}
export function zetBalkSessieVerborgen(v: boolean): void {
  try { if (v) sessionStorage.setItem(SESSIE_SLEUTEL, '1'); else sessionStorage.removeItem(SESSIE_SLEUTEL); } catch { /* privévenster */ }
  try { window.dispatchEvent(new CustomEvent(SESSIE_GEBEURTENIS)); } catch { /* geen venster */ }
}
export function useBalkSessieVerborgen(): boolean {
  const [v, setV] = useState<boolean>(balkSessieVerborgen);
  useEffect(() => {
    const op = () => setV(balkSessieVerborgen());
    window.addEventListener(SESSIE_GEBEURTENIS, op);
    return () => window.removeEventListener(SESSIE_GEBEURTENIS, op);
  }, []);
  return v;
}

// MAILAI-002: обраний рушій (на цьому пристрої — локальний ШІ є лише тут). «auto» = спершу безкоштовний.
const VOORKEUR_GEBEURTENIS = 'mail:ai-motor-voorkeur';
export function leesMotorVoorkeur(): string {
  try { return localStorage.getItem(MOTOR_VOORKEUR_SLEUTEL) || MOTOR_AUTO; } catch { return MOTOR_AUTO; }
}
export function zetMotorVoorkeur(id: string): void {
  try { if (!id || id === MOTOR_AUTO) localStorage.removeItem(MOTOR_VOORKEUR_SLEUTEL); else localStorage.setItem(MOTOR_VOORKEUR_SLEUTEL, id); } catch { /* */ }
  try { window.dispatchEvent(new CustomEvent(VOORKEUR_GEBEURTENIS)); } catch { /* */ }
}
export function useMotorVoorkeur(): string {
  const [v, setV] = useState<string>(leesMotorVoorkeur);
  useEffect(() => {
    const op = () => setV(leesMotorVoorkeur());
    window.addEventListener(VOORKEUR_GEBEURTENIS, op);
    window.addEventListener('storage', op);
    return () => { window.removeEventListener(VOORKEUR_GEBEURTENIS, op); window.removeEventListener('storage', op); };
  }, []);
  return v;
}
