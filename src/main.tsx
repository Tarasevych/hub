import './extensie-welkom-opslag'; // eerst: legt ?extension=welcome (na het installeren van de extensie) vast vóór het aanmelden
import './mcp-toestemming-opslag'; // eerst: legt ?consent=<id> van Claude vast vóór het aanmelden en vóór andere modules de URL aanpassen
import { createRoot } from 'react-dom/client';
import { isOAuthTerug, verwerkOAuthTerug } from './oauth-terug';
import './ai-site-acties'; // acties voor AI-assistenten via de browserextensie (postMessage) en WebMCP
import './browser-agent-hartslag'; // bevestigt vanuit een ingelogde pagina dat de aangezette browserextensie actief mag blijven
import { CANONICAL_AUTH_CHANGE, listenCanonicalAuthChanges } from './canoniek-gebeurtenissen';
import { ecosystemSessionLikely, wachtOpSessieHint } from './tab-context';
import { installeerUitklapGeheugen } from './platform/uitklap'; // punt 4: uitklapblokken onthouden + #anker opent het juiste blok
import { installeerEenMenu } from './platform/een-menu';
import { startImpersonatieModus } from './impersonatie/modus'; // «Подивитися як користувач»: vóór de app, anders gaan de eerste aanroepen als de beheerder zelf
import { installeerMobielVeilig } from './mobiel-veilig/vlag'; // MOBIEL-BREEDTE-VEILIG v1 (vlag 0302): <html data-mobiel-breedte-veilig> vóór de eerste lay-out
import './index.css';
import './ontwerp/fundament.css'; // фундамент дизайну 20.10.2026: токени → примітиви → мобільна верстка (після preflight)
import './mobiel-ux.css';
import './maquette-kern/maquette-tokens.css';
import './maquette-kern/maquette-oppervlakken.css';
import './maquette-kern/maquette-aanmelden.css';
import './maquette-kern/maquette-klassiek.css';
import './platform/sluitknop.css'; // gecentreerde sluitknoppen (specificiteit 0)
import './tech/tech.css';
import './tech/strook.css';
import './centrering-globaal.css'; // UPD-009: єдине симетричне центрування та стабільність макета всіх сторінок без совгання
import './afdruk.css'; // afdrukken (Ctrl+P): de hele pagina op papier, schil weg (zoekronde 02.11.2026; herzien INTEG-001 print)
import { installeerAfdruk } from './platform/afdruk'; // vlak vóór het afdrukken: vaste/afgeknipte vakken vrijmaken, knoppen sorteren (INTEG-001 print)

installeerAfdruk(); // beforeprint/afterprint + Ctrl+P; op elke pagina en elk subdomein, ook de gastpagina

// Menu v2 fase B1: als deze pagina vooraf wordt voorbereid (Speculation Rules «prerender», alleen als de eigenaar dat aanzet),
// start de app — en dus elk API-verzoek, sessie- of tabbladwerk — pas wanneer de gebruiker de pagina echt opent (activering).
const naActivering = (doe: () => void) => {
  const d = document as Document & { prerendering?: boolean };
  if (d.prerendering) document.addEventListener('prerenderingchange', () => doe(), { once: true }); else doe();
};

// Gastpagina (toegangscode inwisselen, §13.11): eigen, losse weergave zonder de app-shell en zonder eigenaarssessie.
const gastPagina = location.pathname === '/toegang' && (location.hostname === 'id.tarasevych.com' || location.hostname === 'localhost');
// SITE-001 (пункти 5 і 19): смуга згоди на реп'яшки та знеособлену аналітику — власний корінь на кожній сторінці, також гостьовій.
const toonToestemming = () => { void import('./toestemming/ToestemmingBand').then(({ default: ToestemmingBand }) => {
  const el = document.createElement('div'); el.id = 'toestemming-band'; document.body.appendChild(el);
  createRoot(el).render(<ToestemmingBand />);
}); };
naActivering(() => {
  // «Підключити автоматично»: terugkeer van OAuth in het popupvenster — geen app-shell, alleen de code doorgeven aan de opener.
  if (isOAuthTerug()) { verwerkOAuthTerug(); return; }
  toonToestemming();
  if (gastPagina) {
    document.getElementById('boot-shell')?.remove();
    document.documentElement.classList.remove('boot-active');
    void import('./GastToegang').then(({ default: GastToegang }) => createRoot(document.getElementById('root')!).render(<GastToegang />));
  } else {
    startImpersonatieModus();
    installeerMobielVeilig();
    // SITE-001 (пункт 12): динамічне завантаження App відокремлює ядро застосунку від легкої гостьової сторінки /toegang і вікна повернення OAuth.
    void import('./App').then(({ default: App }) => {
      createRoot(document.getElementById('root')!).render(<App />);
      installeerUitklapGeheugen();
      installeerEenMenu();
    });
    // Technisch profiel: eigen root naast de app (band + vensters), los van de dienst eronder; SITE-001 (пункт 12): без сеансу не тягне 131 кБ.
    let techGeladen = false;
    const laadTech = () => {
      if (techGeladen || !ecosystemSessionLikely()) return;
      techGeladen = true;
      void import('./tech/TechLaag').then(({ default: TechLaag }) => {
        const el = document.createElement('div'); el.id = 'tech-laag'; document.body.appendChild(el);
        createRoot(el).render(<TechLaag />);
      });
    };
    if (ecosystemSessionLikely()) laadTech();
    else void wachtOpSessieHint().then((h) => { if (h === 'known') laadTech(); });
    listenCanonicalAuthChanges();
    window.addEventListener(CANONICAL_AUTH_CHANGE, laadTech);
    // Melding «Доступне оновлення розширення» (audit 18.10.2026, punt 9): eigen root, alleen als er iets bij te werken is.
    void import('./ExtensieUpdateBand').then(({ default: ExtensieUpdateBand }) => {
      const el = document.createElement('div'); el.id = 'ext-update-band'; document.body.appendChild(el);
      createRoot(el).render(<ExtensieUpdateBand />);
    });
    // «Сайт оновлено до …» (18.10.2026) + UPD-010: фоновий індикатор завантаження та встановлення оновлень на всіх піддоменах.
    void Promise.all([import('./platform/NieuweVersieBand'), import('./platform/UitrolAchtergrondBand')]).then(
      ([{ default: NieuweVersieBand }, { default: UitrolAchtergrondBand }]) => {
        const el = document.createElement('div'); el.id = 'nieuwe-versie-band'; document.body.appendChild(el);
        createRoot(el).render(<><NieuweVersieBand /><UitrolAchtergrondBand /></>);
      },
    );
  }
});

const callbackQuery=/[?&](?:code|state|token|proof|transaction|redeem|handoff)=/i.test(location.search);if('serviceWorker'in navigator&&location.protocol==='https:'&&!callbackQuery){window.addEventListener('load',()=>{const script=new URL('./service-worker.js',location.href);void navigator.serviceWorker.register(script,{scope:'./',updateViaCache:'none'}).then(registration=>{const update=()=>{void registration?.update?.().catch(()=>undefined)};const ric=(window as Window&{requestIdleCallback?:(cb:()=>void,opts?:{timeout:number})=>void}).requestIdleCallback;if(ric)ric(update,{timeout:4000});else window.setTimeout(update,2500)}).catch(()=>undefined)},{once:true})}
