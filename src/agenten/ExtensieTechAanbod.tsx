// mcp.*/agents#extension zonder actief technisch profiel (18.10.2026, melding van de eigenaar: «Відкрити налаштування на сайті» in de
// opties van de extensie leidde stil naar ai.tarasevych.com/verbindingen). De extensie wordt in het technisch profiel ingesteld: we
// blijven op deze pagina, bieden aan het profiel aan te zetten (stap-op in het venster van de band) en tonen daarna meteen de
// installatiehulp — zelfde adres, zelfde #extension. Bij de installatiehulp (?extension=welcome) gaat de hulp na het aanzetten zelf
// verder met koppelen en aanzetten (vraagDoorgaan → BrowserExtensionPanel).
import { Globe, ShieldCheck } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { openTechVenster } from '../tech/tech-opslag';
import { vraagDoorgaan, welcomePending } from '../extensie-welkom-opslag';
import { canonicalNavigationUrl } from '../canoniek-navigatie';

export default function ExtensieTechAanbod({ tr, laden }: { tr: Tr; laden?: boolean }) {
  const welkom = welcomePending();
  const aanzetten = () => { if (welkom) vraagDoorgaan(); openTechVenster('activeren'); };
  return (
    <div className='ag' data-extensie-aanbod={welkom ? 'welkom' : 'instellingen'}>
      <header className='ag-kop'>
        <div>
          <h1>{tr('Розширення браузера', 'Browserextensie')}</h1>
          <p>{tr('Розширення «Mijn Ruimte» налаштовується в технічному профілі: підключення до облікового запису, дозволи для ШІ, діагностика.', 'De extensie "Mijn Ruimte" stelt u in via het technisch profiel: koppelen aan het account, toestemmingen voor de AI, diagnose.')}</p>
        </div>
      </header>
      <section className='ag-kaart' data-paneel='extensie-aanbod' aria-busy={laden ? 'true' : undefined}>
        <div className='ag-kaart-kop'><h3><ShieldCheck size={18} aria-hidden='true' /> {tr('Технічний профіль вимкнено', 'Technisch profiel staat uit')}</h3></div>
        <p>{welkom
          ? tr('Увімкніть технічний профіль (з підтвердженням входу) — далі майстер сам підключить розширення й увімкне його для ШІ. Ви лишитеся на цій сторінці.', 'Zet het technisch profiel aan (met bevestiging van de aanmelding) — daarna koppelt de hulp de extensie zelf en zet hem aan voor de AI. U blijft op deze pagina.')
          : tr('Увімкніть технічний профіль — після підтвердження входу тут відкриються налаштування розширення. Ви лишитеся на цій сторінці.', 'Zet het technisch profiel aan — na bevestiging van de aanmelding verschijnen hier de instellingen van de extensie. U blijft op deze pagina.')}</p>
        <div className='ag-extensie-knoppen'>
          <button type='button' className='ag-knop ag-knop-primary' data-extensie-tech-aan='1' disabled={laden} onClick={aanzetten}>
            <ShieldCheck size={16} aria-hidden='true' />{welkom ? tr('Увімкнути технічний профіль і підключити', 'Technisch profiel aanzetten en koppelen') : tr('Увімкнути технічний профіль', 'Technisch profiel aanzetten')}
          </button>
          <a className='ag-knop' href={canonicalNavigationUrl('ai', 'verbindingen', tr('uk', 'nl') as 'uk' | 'nl')} data-extensie-prive='1'>
            <Globe size={16} aria-hidden='true' />{tr('Приватні підключення ШІ', 'Privé AI-koppelingen')}
          </a>
        </div>
      </section>
    </div>
  );
}
