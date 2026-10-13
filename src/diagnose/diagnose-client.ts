// Browsercontroles van «Щось не працює?» + het ophalen van de servercontroles. Alleen lezen; er wordt niets gewijzigd.
import { api, type ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { serviceFromLocation } from '../canonical-navigation';
import { zijbalkServerDienst } from '../zijbalk-voorkeuren';
import { GRENS, type Uitslag } from '../../shared/diagnose';

export const diagnoseBody = () => ({ service: zijbalkServerDienst() || serviceFromLocation(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

/** Naam van de hoofdbundel die DEZE pagina draait (assets/index-XXXX.js). */
export function eigenBundel(): string {
  const s = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((x) => x.src).find((src) => /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(src));
  return s ? (/(index-[A-Za-z0-9_-]+\.js)/.exec(s)?.[1] ?? '') : '';
}

const mediaan = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function snelheid(): Promise<Uitslag> {
  const tijden: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    try { const r = await fetch('/api/_healthcheck', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(GRENS.snelheidFoutMs) }); if (r.ok) tijden.push(performance.now() - t0); } catch { /* telt als mislukt */ }
  }
  if (!tijden.length) return { id: 'snelheid', stand: 'fout', code: 'GEEN_ANTWOORD' };
  const ms = Math.round(mediaan(tijden));
  return { id: 'snelheid', ms, stand: ms > GRENS.snelheidFoutMs ? 'fout' : ms > GRENS.snelheidLetOpMs ? 'let-op' : 'ok', ...(tijden.length < 3 ? { code: 'SOMS_GEEN_ANTWOORD' } : {}) };
}

function opslag(): Uitslag {
  let lokaal = false;
  try { localStorage.setItem('mr-diagnose-proef', '1'); lokaal = localStorage.getItem('mr-diagnose-proef') === '1'; localStorage.removeItem('mr-diagnose-proef'); } catch { lokaal = false; }
  if (!navigator.cookieEnabled) return { id: 'opslag', stand: 'fout', code: 'COOKIES_UIT' };
  return lokaal ? { id: 'opslag', stand: 'ok' } : { id: 'opslag', stand: 'let-op', code: 'OPSLAG_GEBLOKKEERD' };
}

export type DiagnoseRun = { uitslagen: Uitslag[]; serverBereikt: boolean };

/** Alles tegelijk: browsercontroles en (via één POST) servercontroles + sessie + versie + klok. */
export async function diagnoseUitvoeren(): Promise<DiagnoseRun> {
  const online: Uitslag = { id: 'online', stand: navigator.onLine ? 'ok' : 'fout', ...(navigator.onLine ? {} : { code: 'OFFLINE' }) };
  const t0 = Date.now();
  const [snel, srv] = await Promise.all([
    snelheid(),
    api.post('/api/diagnose/server', diagnoseBody()).then((r) => ({ ok: true as const, data: r.data, t1: Date.now() }), (e: ApiError) => ({ ok: false as const, status: Number(e?.status || 0), code: String(e?.message || '') })),
  ]);
  const uit: Uitslag[] = [online, snel, opslag()];
  if (srv.ok) {
    const d = srv.data as { uitslagen?: Uitslag[]; bundel?: string; nu?: number };
    uit.push(...(Array.isArray(d.uitslagen) ? d.uitslagen : []));
    uit.push({ id: 'sessie', stand: 'ok' });
    const eigen = eigenBundel();
    uit.push(!d.bundel || !eigen ? { id: 'versie', stand: 'onbekend', code: 'NIET_TE_BEPALEN' } : d.bundel === eigen ? { id: 'versie', stand: 'ok' } : { id: 'versie', stand: 'let-op', code: 'OUDE_VERSIE' });
    const verschil = Math.abs(Number(d.nu || 0) - (t0 + srv.t1) / 2);
    uit.push({ id: 'klok', stand: !d.nu ? 'onbekend' : verschil > GRENS.klokFoutMs ? 'fout' : verschil > GRENS.klokLetOpMs ? 'let-op' : 'ok', ms: Math.round(verschil) });
  } else if (srv.status === 401 || srv.status === 403) {
    uit.push({ id: 'sessie', stand: 'fout', code: srv.status === 401 ? 'NIET_AANGEMELD' : 'GEEN_TOEGANG' });
  } else {
    uit.push({ id: 'sessie', stand: 'onbekend', code: srv.status ? `HTTP_${srv.status}` : 'GEEN_VERBINDING' });
  }
  return { uitslagen: uit, serverBereikt: srv.ok };
}

export const browserNaam = () => {
  const ua = navigator.userAgent;
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${b}${os ? ` (${os})` : ''}`;
};
