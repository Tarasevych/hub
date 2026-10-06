import './mcp-consent-store'; // eerst: legt ?consent=<id> van Claude vast vóór het aanmelden en vóór andere modules de URL aanpassen
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

const callbackQuery=/[?&](?:code|state|token|proof|transaction|redeem|handoff)=/i.test(location.search);if('serviceWorker'in navigator&&location.protocol==='https:'&&!callbackQuery){window.addEventListener('load',()=>{const script=new URL('./service-worker.js',location.href);void navigator.serviceWorker.register(script,{scope:'./',updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>undefined)},{once:true})}
