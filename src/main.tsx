import './extension-welcome-store'; // eerst: legt ?extension=welcome (na het installeren van de extensie) vast vóór het aanmelden
import './mcp-consent-store'; // eerst: legt ?consent=<id> van Claude vast vóór het aanmelden en vóór andere modules de URL aanpassen
import { createRoot } from 'react-dom/client';
import { isOAuthTerug, verwerkOAuthTerug } from './oauth-terug';
import './ai-site-actions'; // acties voor AI-assistenten via de browserextensie (postMessage) en WebMCP
import './browser-agent-heartbeat'; // bevestigt vanuit een ingelogde pagina dat de aangezette browserextensie actief mag blijven
import App from './App';
import { installeerUitklapGeheugen } from './platform/uitklap'; // punt 4: uitklapblokken onthouden + #anker opent het juiste blok
import { installeerEenMenu } from './platform/een-menu';
import './index.css';
import './mobile-ux.css';

// Menu v2 fase B1: als deze pagina vooraf wordt voorbereid (Speculation Rules «prerender», alleen als de eigenaar dat aanzet),
// start de app — en dus elk API-verzoek, sessie- of tabbladwerk — pas wanneer de gebruiker de pagina echt opent (activering).
const naActivering = (doe: () => void) => {
  const d = document as Document & { prerendering?: boolean };
  if (d.prerendering) document.addEventListener('prerenderingchange', () => doe(), { once: true }); else doe();
};

// Gastpagina (toegangscode inwisselen, §13.11): eigen, losse weergave zonder de app-shell en zonder eigenaarssessie.
const gastPagina = location.pathname === '/toegang' && (location.hostname === 'id.tarasevych.com' || location.hostname === 'localhost');
naActivering(() => {
  // «Підключити автоматично»: terugkeer van OAuth in het popupvenster — geen app-shell, alleen de code doorgeven aan de opener.
  if (isOAuthTerug()) { verwerkOAuthTerug(); return; }
  if (gastPagina) {
    document.getElementById('boot-shell')?.remove();
    document.documentElement.classList.remove('boot-active');
    void import('./GastToegang').then(({ default: GastToegang }) => createRoot(document.getElementById('root')!).render(<GastToegang />));
  } else { createRoot(document.getElementById('root')!).render(<App />); installeerUitklapGeheugen(); installeerEenMenu(); }
});

const callbackQuery=/[?&](?:code|state|token|proof|transaction|redeem|handoff)=/i.test(location.search);if('serviceWorker'in navigator&&location.protocol==='https:'&&!callbackQuery){window.addEventListener('load',()=>{const script=new URL('./service-worker.js',location.href);void navigator.serviceWorker.register(script,{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>undefined)},{once:true})}
