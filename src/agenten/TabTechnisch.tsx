// Hub «Підключення ШІ» → tab «Технічне» (was mcp.*/verbindingen «Технічні підключення»; dat adres leidt nu hierheen).
// Het tabblad staat alleen in de rij met een ACTIEF technisch profiel. Een directe link zonder activering toont wat het is en
// (met een technisch profiel) de knop om het te activeren — nooit de technische gegevens zelf (de server weigert die ook).
// INTEG-001 (agpag2, 03.11.2026): de poort is één blok (.ag-blok) met naam, één zin en de knop in de kop; met activering staan
// «Окремі простори» en de technische verbindingen elk als eigen blokken onder elkaar.
import { RefreshCw, ShieldCheck } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { openTechVenster, techActief, techVernieuwen, useTech } from '../tech/tech-opslag';
import TechVerbindingen from './TechVerbindingen';
import RuimteScheiding from './RuimteScheiding';
import './agenten-tabs-2.css';
import './agenten-toegang-maquette.css';

export default function TabTechnisch({ tr }: { tr: Tr }) {
  const tech = useTech();
  // Migratie 0082: boven de technische verbindingen staat de scheiding van de GEGEVENS (eigen lade / gedeeld / uit per dienst).
  // Eerst de ruimte, dan wat erin staat: wie nog niet koos, ziet hier de eenmalige keuze en begrijpt waarom de rest leeg is.
  if (techActief(tech)) return <div className='ag-tab ag2-blokken' data-tab-inhoud='technisch'><div id='ruimte'><RuimteScheiding tr={tr} /></div><TechVerbindingen tr={tr} ingebed /></div>;
  return (
    <div className='ag-tab ag2-blokken' data-tab-inhoud='technisch' id='ruimte' data-technisch-poort={tech.profiel ? 'activeren' : tech.fout ? 'netwerkfout' : !tech.geladen ? 'laden' : 'geen-profiel'}>
      <section className='ag-blok' data-ag-blok='technisch-poort' aria-labelledby='ag2-tech-poort-kop'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='ag2-tech-poort-kop'><ShieldCheck aria-hidden='true' /> {tr('Технічні підключення', 'Technische verbindingen')}</h3>
          <p className='ag-blok-uitleg'>{tr('Двері сервера, технічний конектор і токени, агенти на самому сервері — видно лише з технічним профілем, активним у цій вкладці.', 'De serverdeur, de technische connector en tokens, agenten op de server zelf — alleen zichtbaar met een technisch profiel dat in dit tabblad actief is.')}</p>
          {tech.profiel ? (
            <div className='ag-knoppen'>
              <button type='button' className='ag-knop ag-knop-primary' data-technisch-aan='1' onClick={() => openTechVenster('activeren')}><ShieldCheck size={16} aria-hidden='true' />{tr('Активувати технічний профіль', 'Technisch profiel activeren')}</button>
            </div>
          ) : tech.fout ? (
            <div className='ag-knoppen'>
              <button type='button' className='ag-knop' onClick={() => void techVernieuwen()}><RefreshCw size={16} aria-hidden='true' />{tr('Повторити', 'Opnieuw')}</button>
            </div>
          ) : null}
        </header>
        {tech.profiel ? null : tech.fout ? (
          <p className='ag-leeg' data-tech-fout='netwerk'>{tr('Не вдалося отримати стан технічного профілю (сервер недоступний). Спробуйте ще раз.', 'Status van het technisch profiel kon niet worden opgehaald (server onbereikbaar). Probeer het opnieuw.')}</p>
        ) : !tech.geladen ? (
          <p className='ag-leeg'>{tr('Завантаження…', 'Laden…')}</p>
        ) : <p className='ag-leeg'>{tr('У вашого облікового запису немає технічного профілю.', 'Uw account heeft geen technisch profiel.')}</p>}
      </section>
    </div>
  );
}
