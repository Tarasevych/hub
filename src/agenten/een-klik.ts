// «Підключити автоматично (в один клік)» vanuit de site zelf: een volledige OAuth 2.1-koppeling met PKCE (S256) in de browser.
//
//   1. dynamische registratie (RFC 7591) met als terugkeeradres de site zelf: https://mcp.<domein>/oauth-terug;
//   2. popup naar /oauth/authorize (deur) of /oauth2/authorize (connector) → het venster «Дозволити» van de site (bestaande aanmelding);
//   3. de popup geeft code + state terug via postMessage (src/oauth-terug.ts), state wordt vergeleken;
//   4. code + verifier → toegangs- en refresh-token (de verifier verlaat dit venster nooit, staat alleen in het geheugen).
// Resultaat: een Bearer-token met de duur die de eigenaar koos, één keer getoond, voor klanten die geen eigen OAuth in de browser doen.
import { SITE_TERUG_PAD } from '../../shared/ai-verbinding';
import { agentUrl, OUD_GEDEELD_URL, type AgentSlug } from '../../shared/connector-v2/agenten';

// EEN ADRES PER AGENT (20.10.2026): de connector heet https://mcp.<domein>/<agent> (/claude, /gpt, /grok, /gemini, /copilot,
// /cursor). `agent: null` bestaat alleen voor «Інший клієнт» — die heeft geen eigen pad en valt terug op het oude gedeelde adres.
export type Doel = { soort: 'deur'; deur: string } | { soort: 'connector'; agent: AgentSlug | null };
export type EenKlikToken = { access_token: string; refresh_token: string; expires_in: number; endpoint: string; clientId: string; tokenUrl: string };
export class EenKlikFout extends Error { constructor(public code: string) { super(code); } }

const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const willekeurig = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export function adressen(doel: Doel, origin = location.origin) {
  const deur = doel.soort === 'deur';
  return {
    endpoint: deur ? `${origin}/${doel.deur}` : doel.agent ? agentUrl(doel.agent) : OUD_GEDEELD_URL,
    register: `${origin}${deur ? '/oauth/register' : '/oauth2/register'}`,
    authorize: `${origin}${deur ? '/oauth/authorize' : '/oauth2/authorize'}`,
    token: `${origin}${deur ? '/oauth/token' : '/oauth2/token'}`,
    terug: `${origin}${SITE_TERUG_PAD}`,
  };
}

/**
 * Start de koppeling. `venster` moet SYNCHROON in de klik geopend zijn (window.open vóór enige await), anders blokkeert de browser
 * de popup. Bij annuleren/sluiten: EenKlikFout('GESLOTEN'); bij weigeren: 'GEWEIGERD'.
 */
export async function verbindInEenKlik(doel: Doel, klantNaam: string, venster: Window | null, ruimte: 'prive' | 'technisch' = 'prive'): Promise<EenKlikToken> {
  if (!venster) throw new EenKlikFout('POPUP_GEBLOKKEERD');
  const a = adressen(doel);
  try {
    const reg = await fetch(a.register, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: `${klantNaam} (через сайт)`.slice(0, 60), redirect_uris: [a.terug], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    });
    if (!reg.ok) throw new EenKlikFout(`REGISTRATIE_${reg.status}`);
    const clientId = String((await reg.json()).client_id || '');
    const verifier = willekeurig(48);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = willekeurig(18);
    const url = new URL(a.authorize);
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: clientId, redirect_uri: a.terug, code_challenge: challenge, code_challenge_method: 'S256', state, resource: a.endpoint, scope: doel.soort === 'deur' ? 'read' : 'machines', ...(ruimte === 'technisch' && doel.soort === 'connector' ? { ruimte } : {}) })) url.searchParams.set(k, v);
    venster.location.href = url.toString();

    const code = await new Promise<string>((resolve, reject) => {
      const klaar = (fn: () => void) => { window.removeEventListener('message', luister); window.clearInterval(dicht); window.clearTimeout(tijd); fn(); };
      const luister = (e: MessageEvent) => {
        if (e.origin !== location.origin || e.source !== venster || e.data?.type !== 'mr-oauth-terug') return;
        if (e.data.state !== state) return klaar(() => reject(new EenKlikFout('STATE_ONGELDIG')));
        if (e.data.error) return klaar(() => reject(new EenKlikFout(e.data.error === 'access_denied' ? 'GEWEIGERD' : `OAUTH_${String(e.data.error).slice(0, 40)}`)));
        klaar(() => resolve(String(e.data.code || '')));
      };
      const dicht = window.setInterval(() => { if (venster.closed) klaar(() => reject(new EenKlikFout('GESLOTEN'))); }, 700);
      const tijd = window.setTimeout(() => klaar(() => reject(new EenKlikFout('VERLOPEN'))), 10 * 60 * 1000);
      window.addEventListener('message', luister);
    });
    if (!code) throw new EenKlikFout('GEEN_CODE');
    const tok = await fetch(a.token, {
      method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: a.terug, client_id: clientId, code_verifier: verifier }).toString(),
    });
    if (!tok.ok) throw new EenKlikFout(`TOKEN_${tok.status}`);
    const t = await tok.json();
    if (typeof t.access_token !== 'string') throw new EenKlikFout('TOKEN_ONVOLLEDIG');
    return { access_token: t.access_token, refresh_token: String(t.refresh_token || ''), expires_in: Number(t.expires_in) || 0, endpoint: a.endpoint, clientId, tokenUrl: a.token };
  } finally {
    try { if (!venster.closed) venster.close(); } catch { /* al dicht */ }
  }
}
