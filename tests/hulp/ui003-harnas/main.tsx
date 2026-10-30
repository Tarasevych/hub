// Testharnas UI-003 (niet in de bundel): rendert het verbindingencentrum (of, met ?voor=1, het huidige vNext-integratiecentrum)
// met nagebootste antwoorden van de bestaande routes. ?s=leeg|een|meer|fout|netwerk, ?thema=licht|donker, ?lang=uk|nl.
import { createRoot } from 'react-dom/client';
import '../../../src/ontwerp/tokens.css';
import '../../../src/cloud-vnext/cloud-vnext.css';
import '../../../src/cloud-vnext/cloud-vnext-integraties.css';
import VerbindingenCentrum from '../../../src/verbindingen/VerbindingenCentrum';
import Integraties from '../../../src/cloud-vnext/onderdelen/Integraties';

const q = new URLSearchParams(location.search);
const s = q.get('s') || 'meer', lang = (q.get('lang') || 'uk') as 'uk' | 'nl', donker = q.get('thema') === 'donker';
document.documentElement.className = donker ? 'theme-dark' : 'theme-light';
document.body.style.cssText = `margin:0;background:var(--bg);font-family:system-ui,sans-serif`;
const nu = Date.now();
const g = (id: string, email: string, status: string, sync?: object, actief = false) => ({ id, email, status, actief, ...(sync ? { sync } : {}) });
const SCEN: Record<string, unknown> = {
  leeg: { google: { gekoppeld: false, accounts: [] }, photos: { gekoppeld: false }, m4: { stagingAan: false, aanbieders: [{ id: 'onedrive', sleutelsAanwezig: false, accounts: [] }, { id: 'dropbox', sleutelsAanwezig: false, accounts: [] }, { id: 'box', sleutelsAanwezig: false, accounts: [] }] }, zoekIndex: { cloud: true, drive: true } },
  een: { google: { gekoppeld: true, accounts: [g('g1', 'pavlo@example.test', 'connected', { laatstGeluktOp: nu - 4 * 60_000, laatstPogingOp: nu - 4 * 60_000, foutCode: '', herstelNodig: false }, true)] }, photos: { gekoppeld: true }, m4: { stagingAan: false, aanbieders: [{ id: 'onedrive', sleutelsAanwezig: false, accounts: [] }, { id: 'dropbox', sleutelsAanwezig: false, accounts: [] }, { id: 'box', sleutelsAanwezig: false, accounts: [] }] }, zoekIndex: { cloud: true, drive: true } },
  meer: { google: { gekoppeld: true, accounts: [
    g('g1', 'pavlo@example.test', 'connected', { laatstGeluktOp: nu - 3 * 60_000, laatstPogingOp: nu - 3 * 60_000, foutCode: '', herstelNodig: false }, true),
    g('g2', 'werk@example.test', 'reauth_required', { laatstGeluktOp: nu - 3 * 86400_000, laatstPogingOp: nu - 600_000, foutCode: 'GOOGLE_TOKEN_REFRESH_FAILED', herstelNodig: false }),
    g('g3', 'archief@example.test', 'connected', { laatstGeluktOp: nu - 2 * 3600_000, laatstPogingOp: nu - 120_000, foutCode: 'DRIVE_HTTP_503', herstelNodig: false }),
  ] }, photos: { gekoppeld: false }, m4: { stagingAan: true, aanbieders: [{ id: 'onedrive', sleutelsAanwezig: true, accounts: [{ id: 'm1', label: 'OneDrive (особистий)', status: 'connected' }] }, { id: 'dropbox', sleutelsAanwezig: false, accounts: [] }, { id: 'box', sleutelsAanwezig: false, accounts: [] }] }, zoekIndex: { cloud: true, drive: true } },
};
const TAKEN = s === 'meer' ? [{ id: 't1', soort: 'kopie', stand: 'klaar', naam: 'Звіт 2026.pdf', bijgewerktOp: new Date(nu - 3600_000).toISOString() }, { id: 't2', soort: 'verplaats', stand: 'fout', naam: 'Фото-архів.zip', bijgewerktOp: new Date(nu - 86400_000).toISOString() }] : [];
(window as unknown as { __roepen: string[] }).__roepen = [];
const echt = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('/api/')) return echt(input as RequestInfo, init);
  (window as unknown as { __roepen: string[] }).__roepen.push(url.replace(location.origin, ''));
  const j = (b: unknown, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/vnext/integraties')) { if (s === 'netwerk') throw new TypeError('net'); if (s === 'fout') return j({ error: 'CLOUD_VNEXT_FOUT' }, 500); return j(SCEN[s] || SCEN.meer); }
  if (url.includes('/vnext/taken')) return j({ taken: TAKEN });
  if (url.includes('/connect/start')) return j({ ok: true, authUrl: 'about:blank#nep-google' });
  return j({});
};
const naarTab = (t: string) => { (window as unknown as { __naar?: string }).__naar = t; };
createRoot(document.getElementById('root')!).render(q.get('voor') ? <section className='cvn'><div className='cvn-inhoud'><Integraties lang={lang} smal={innerWidth < 760} userEmail='' sourceOrigin='' tabContext='' ov={null} vernieuw={async () => {}} toon={() => {}} naarTab={naarTab as never} /></div></section> : <VerbindingenCentrum lang={lang} naarTab={naarTab} />);
