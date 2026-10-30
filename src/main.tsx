import './extensie-welkom-opslag'; // eerst: legt ?extension=welcome (na het installeren van de extensie) vast vóór het aanmelden
import './mcp-toestemming-opslag'; // eerst: legt ?consent=<id> van Claude vast vóór het aanmelden en vóór andere modules de URL aanpassen
import { createRoot } from 'react-dom/client';
import { isOAuthTerug, verwerkOAuthTerug } from './oauth-terug';
import './ai-site-acties'; // acties voor AI-assistenten via de browserextensie (postMessage) en WebMCP
import './browser-agent-hartslag'; // bevestigt vanuit een ingelogde pagina dat de aangezette browserextensie actief mag blijven
import App from './App';
import { installeerUitklapGeheugen } from './platform/uitklap'; // punt 4: uitklapblokken onthouden + #anker opent het juiste blok
import { installeerEenMenu } from './platform/een-menu';
import { startImpersonatieModus } from './impersonatie/modus'; // «Подивитися як користувач»: vóór de app, anders gaan de eerste aanroepen als de beheerder zelf
import './index.css';
import './ontwerp/fundament.css'; // фундамент дизайну 20.10.2026: токени → примітиви → мобільна верстка (після preflight)
import './mobiel-ux.css';
import './platform/sluitknop.css'; // gecentreerde sluitknoppen (specificiteit 0)

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
  } else {
    startImpersonatieModus();
    createRoot(document.getElementById('root')!).render(<App />); installeerUitklapGeheugen(); installeerEenMenu();
    // Technisch profiel: eigen root naast de app (band + vensters), los van de dienst eronder; laadt pas na de app.
    void import('./tech/TechLaag').then(({ default: TechLaag }) => {
      const el = document.createElement('div'); el.id = 'tech-laag'; document.body.appendChild(el);
      createRoot(el).render(<TechLaag />);
    });
    // Melding «Доступне оновлення розширення» (audit 18.10.2026, punt 9): eigen root, alleen als er iets bij te werken is.
    void import('./ExtensieUpdateBand').then(({ default: ExtensieUpdateBand }) => {
      const el = document.createElement('div'); el.id = 'ext-update-band'; document.body.appendChild(el);
      createRoot(el).render(<ExtensieUpdateBand />);
    });
    // «Сайт оновлено до …» (18.10.2026): open tabbladen horen dat er een nieuwe release draait (nieuwe-versie.ts).
    void import('./platform/NieuweVersieBand').then(({ default: NieuweVersieBand }) => {
      const el = document.createElement('div'); el.id = 'nieuwe-versie-band'; document.body.appendChild(el);
      createRoot(el).render(<NieuweVersieBand />);
    });
  }
});

const callbackQuery=/[?&](?:code|state|token|proof|transaction|redeem|handoff)=/i.test(location.search);if('serviceWorker'in navigator&&location.protocol==='https:'&&!callbackQuery){window.addEventListener('load',()=>{const script=new URL('./service-worker.js',location.href);void navigator.serviceWorker.register(script,{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>undefined)},{once:true})}
