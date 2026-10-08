import './extension-welcome-store'; // eerst: legt ?extension=welcome (na het installeren van de extensie) vast vóór het aanmelden
import './mcp-consent-store'; // eerst: legt ?consent=<id> van Claude vast vóór het aanmelden en vóór andere modules de URL aanpassen
import { createRoot } from 'react-dom/client';
import './ai-site-actions'; // acties voor AI-assistenten via de browserextensie (postMessage) en WebMCP
import './browser-agent-heartbeat'; // bevestigt vanuit een ingelogde pagina dat de aangezette browserextensie actief mag blijven
import App from './App';
import './index.css';
import './mobile-ux.css';

createRoot(document.getElementById('root')!).render(<App />);

const callbackQuery=/[?&](?:code|state|token|proof|transaction|redeem|handoff)=/i.test(location.search);if('serviceWorker'in navigator&&location.protocol==='https:'&&!callbackQuery){window.addEventListener('load',()=>{const script=new URL('./service-worker.js',location.href);void navigator.serviceWorker.register(script,{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>undefined)},{once:true})}
