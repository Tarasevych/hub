// Terugkeeradres van de site zelf voor «Підключити автоматично» (PKCE in de pagina, zie src/agenten/een-klik.ts):
// https://mcp.<domein>/oauth-terug?code=…&state=…  (of ?error=access_denied). Dit draait in het popupvenster: het geeft de uitkomst
// door aan het venster dat de koppeling startte (zelfde origin, postMessage) en sluit. De code is eenmalig (2–5 min) en zonder de
// PKCE-verifier (alleen in het opener-venster, in het geheugen) waardeloos. Zonder opener: korte uitleg, geen app-shell.
import { SITE_TERUG_PAD } from '../shared/ai-verbinding';

export const isOAuthTerug = () => location.pathname === SITE_TERUG_PAD;

export function verwerkOAuthTerug(): void {
  const q = new URLSearchParams(location.search);
  const bericht = { type: 'mr-oauth-terug', code: q.get('code') || '', state: q.get('state') || '', error: q.get('error') || '', iss: q.get('iss') || '' };
  try { history.replaceState(null, '', SITE_TERUG_PAD); } catch { /* geen history */ }
  document.getElementById('boot-shell')?.remove();
  document.documentElement.classList.remove('boot-active');
  const root = document.getElementById('root');
  const uk = document.documentElement.lang !== 'nl';
  const toon = (tekst: string) => { if (root) { root.textContent = ''; const p = document.createElement('p'); p.style.cssText = 'font:16px system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem'; p.textContent = tekst; root.appendChild(p); } };
  const opener = window.opener as Window | null;
  if (opener && !opener.closed) {
    opener.postMessage(bericht, location.origin);
    toon(uk ? 'Готово. Це вікно можна закрити.' : 'Klaar. U kunt dit venster sluiten.');
    window.setTimeout(() => window.close(), 300);
    return;
  }
  toon(bericht.error
    ? (uk ? 'Доступ не надано. Закрийте це вікно й почніть підключення знову на сторінці «Підключення ШІ» — вкладка «Токени» або «Технічне».' : 'Geen toegang gegeven. Sluit dit venster en begin opnieuw onder «AI-koppelingen» — tab «Tokens» of «Technisch».')
    : (uk ? 'Вікно, яке почало підключення, закрито. Почніть знову на сторінці «Підключення ШІ» — вкладка «Токени» або «Технічне».' : 'Het venster dat de koppeling startte, is gesloten. Begin opnieuw onder «AI-koppelingen» — tab «Tokens» of «Technisch».'));
}
