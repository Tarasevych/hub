// Hub «Підключення ШІ» → tab «Розширення браузера» (extensie 0.6, contract EXT-06 §4; melding eigenaar 19.10.2026: «пропало»).
// Altijd zichtbaar, voor iedereen. Eén extensie, twee profielen (= twee sloten):
//  - «Як користувач»: koppelen met ruimte 'prive' (?koppel=prive start meteen), wat de AI mag (bestaande toestemmingen),
//    toegang openen met step-up (ExtensiePrive), live status per slot. Geen technisch profiel nodig.
//  - «Технічний профіль»: ALLEEN als het account een technisch profiel heeft (recht.technisch !== null). Actief in dit tabblad →
//    koppelen met ruimte 'technisch' + passkey-ontgrendeling (ExtensieOntgrendeling uit 0.5). Niet actief → één regel + «Активувати».
// Gebruikers zonder technisch profiel zien dus geen enkel technisch element (ook geen uitgeschakelde knoppen).
import { ArrowRight, Bug, Globe, ShieldCheck, User } from 'lucide-react';
import type { Agent } from '../agenten-gegevens';
import type { Tr } from '../mcp-ui';
import BrowserExtensionPanel from '../BrowserExtensiePaneel';
import { openTechVenster, profielVan, techActief, useTech } from '../tech/tech-opslag';
import { combineer, useExtensieLiveToestand, type LokaalDiagnostiek } from '../extensie/extensie-live';
import { DIAG_PAKKET } from '../../shared/extensie-ontgrendeling';
import AgentKleuren from './AgentKleuren';
import LokaleAiPaneel from '../extensie/LokaleAiPaneel';
import '../extensie/BrowserEnAgenten.css';
import './agenten-tabs-2.css';
import './agenten-toegang-maquette.css';

type PanelAgents = Parameters<typeof BrowserExtensionPanel>[0]['agentsExtern'];

/**
 * 0.6.1 (punt 7 eigenaar 19.10.2026): stand van het debuggerrecht van de extensie in DEZE browser, in woorden.
 * De site kan het recht niet geven (dat doet alleen Chrome) — ze zegt wat de stand is en wat de gebruiker kan doen.
 */
const DIAG_REGEL: Readonly<Record<LokaalDiagnostiek['stand'], readonly [string, string]>> = Object.freeze({
  ja: ['Дозвіл налагоджувача: є — глибока діагностика доступна в технічному профілі, лише на адмін-сторінках і лише за відкритого доступу.',
    'Debuggerrecht: aanwezig — diepe diagnose kan in het technische profiel, alleen op de beheerpagina’s en alleen bij een open toegang.'],
  nee: ['Дозвіл налагоджувача: немає. Увімкніть глибоку діагностику в налаштуваннях розширення (перемикач сам запитає дозвіл під час натискання).',
    'Debuggerrecht: niet aanwezig. Zet diepe diagnose aan in de instellingen van de extensie (de schakelaar vraagt het recht tijdens de klik).'],
  geweigerd: ['Дозвіл налагоджувача: ви відмовили у вікні Chrome. Натисніть перемикач у налаштуваннях розширення ще раз.',
    'Debuggerrecht: u hebt in het venster van Chrome geweigerd. Zet de schakelaar in de instellingen van de extensie opnieuw aan.'],
  ingetrokken: ['Дозвіл налагоджувача відкликано — глибока діагностика не збирає нічого. Увімкніть перемикач у налаштуваннях розширення ще раз.',
    'Het debuggerrecht is ingetrokken — diepe diagnose verzamelt niets. Zet de schakelaar in de instellingen van de extensie opnieuw aan.'],
  'niet-aanvraagbaar': ['Chrome не дозволяє просити дозвіл налагоджувача на вимогу. Це не помилка розширення: щоб глибока діагностика працювала, встановіть пакет «діагностика» — у ньому дозвіл записаний у маніфесті.',
    'Chrome staat het niet toe het debuggerrecht op verzoek te vragen. Geen fout van de extensie: gebruik voor diepe diagnose het pakket «diagnose» — daarin staat het recht in het manifest.'],
});

export default function TabExtensie({ tr, agents, techAgents, naActie, versie, koppel, naarBrowser }: {
  tr: Tr; agents: Agent[]; techAgents: Agent[]; naActie: () => Promise<void>; versie: number; koppel: '' | 'prive' | 'technisch';
  /** Zone E: naar het ene beheerscherm «Браузер і агенти» (matrix + termijnen). */
  naarBrowser?: () => void;
}) {
  const tech = useTech();
  const t = useExtensieLiveToestand();
  const live = combineer(t, undefined, Date.now(), 'prive');
  // Heeft dit account een technisch profiel? De server zegt het (recht.technisch === null → nee); oude server: het tech-profiel van de sessie.
  const techProfiel = live.techProfiel ?? (tech.geladen ? !!tech.profiel : false);
  const actief = techActief(tech);
  const profiel = profielVan(tech);
  const prive = agents.filter((a) => a.platform === 'browser');
  const technisch = techAgents.filter((a) => a.platform === 'browser');
  // Stand van het debuggerrecht: alleen de extensie in deze browser meldt hem (0.6.1); een oudere extensie meldt niets → geen regel.
  const diag = live.diagnostiek;

  const blok = (a: Agent) => (
    <li key={a.id} className='ag-kaart ag-ext-slot' data-ext-agent={a.id}>
      <h4 className='ag-ext-naam'>{a.name}</h4>
      <BrowserExtensionPanel tr={tr} part='agent' agentId={a.id} compact versie={versie} agentsExtern={[...prive, ...technisch] as unknown as PanelAgents} reloadExtern={naActie} />
    </li>
  );

  // INTEG-001 (agpag2, 03.11.2026): elk onderdeel is één blok (.ag-blok uit het contract van agenten-pagina.css) met een duidelijke
  // naam, één zin waarvoor het dient en de knoppen in de kop. Geen kaart-in-kaart meer: het blok is de rand, de inhoud is kaal.
  // De verwijzing naar «Браузер і агенти» (zone E, 22.10.2026: wat de AI mag staat dáár) is een knop in de kop van «Як користувач».
  return (
    <div className='ag-tab ag-ext ag2-blokken' data-tab-inhoud='extensie' data-tab-profiel={profiel}>
      <section className='ag-blok' id='extension-lokaal' data-ext-sectie='gebruiker' data-ag-blok='extensie-gebruiker' aria-labelledby='ag-ext-gebruiker'>
        <header className='ag-blok-kop'>
          <h3 className='ag-blok-titel' id='ag-ext-gebruiker'><Globe aria-hidden='true' /> {tr('Як користувач', 'Als gebruiker')}</h3>
          <p className='ag-blok-uitleg'>{tr('Встановіть розширення й підключіть його до свого облікового запису — тоді ШІ зможе працювати з вашими сторінками.', 'Installeer de extensie en koppel ze aan uw account — dan kan de AI met uw pagina’s werken.')}</p>
          <div className='ag-knoppen' data-ext-naar-browser='1'>
            <button type='button' className='ag-knop' onClick={naarBrowser} data-ext-naar-browser-knop='1' title={tr('Що може ШІ, на який строк і для якого агента — усе на одному екрані «Браузер і агенти».', 'Wat de AI mag, hoe lang en voor welke agent — alles op één scherm «Browser en agenten».')}>
              <ArrowRight size={16} aria-hidden='true' />{tr('Налаштувати, що може ШІ', 'Instellen wat de AI mag')}
            </button>
          </div>
        </header>
        <p className='ag-rij ag2-rij is-let ag-ext-profiel' role='status' data-profiel-tab={profiel}>
          {profiel === 'technisch' ? <ShieldCheck aria-hidden='true' /> : <User aria-hidden='true' />}
          <span>{tr('Профіль цієї вкладки: ', 'Profiel van dit tabblad: ')}<b>{profiel === 'technisch' ? tr('Технічний', 'Technisch') : tr('Користувач', 'Gebruiker')}</b>.{' '}
            {profiel === 'technisch'
              ? tr('Розширення може виконувати технічні команди лише у вкладках із технічним профілем; ваші власні сторінки — через доступ «як користувач».', 'De extensie voert technische opdrachten alleen uit in tabbladen met het technisch profiel; uw eigen pagina’s via de toegang «als gebruiker».')
              : tr('ШІ через розширення бачить лише ваше: пошту, диск, хаб — і лише те, що ви дозволили.', 'De AI ziet via de extensie alleen het uwe: mail, drive, hub — en alleen wat u toestaat.')}</span>
        </p>
        <div className='ag2-paneel' data-paneel='extensie'>
          <BrowserExtensionPanel tr={tr} part='install' ruimte='prive' autoKoppel={koppel === 'prive'} agentsExtern={prive as unknown as PanelAgents} reloadExtern={naActie} versie={versie} />
        </div>
        {prive.length ? <ul className='ag-ext-lijst ag2-raster' data-lijst='extensie-prive'>{prive.map(blok)}</ul> : null}
      </section>

      {/* 0.6.2: welke kleur hoort bij welke AI — de rand in het tabblad, de badge en de lijst gebruiken dezelfde kleur. */}
      <AgentKleuren tr={tr} blok />

      {/* EXT090-001: ingebouwde AI van Chrome (extensie 0.9.0) — wat Chrome hier aanbiedt en wat de extensie mag; tekst blijft lokaal. */}
      <LokaleAiPaneel tr={tr} keuze={live.extensie?.lokaleAi ?? null} extVersie={live.extensie?.versie ?? ''} extId={live.extensie?.extensieId ?? ''} />

      {techProfiel ? (
        <section className='ag-blok' data-ext-sectie='technisch' data-ag-blok='extensie-technisch' data-tech-actief={actief ? '1' : '0'} aria-labelledby='ag-ext-technisch'>
          <header className='ag-blok-kop'>
            <h3 className='ag-blok-titel' id='ag-ext-technisch'><ShieldCheck aria-hidden='true' /> {tr('Технічний профіль', 'Technisch profiel')}</h3>
            {actief
              ? <p className='ag-blok-uitleg'>{tr('Окремий слот для адміністрування: власне підключення, розблокування вашим passkey на короткий час, лише в межах технічних ролей.', 'Een apart slot voor beheer: een eigen koppeling, ontgrendelen met uw passkey voor korte tijd, alleen binnen uw technische rollen.')}</p>
              : <p className='ag-blok-uitleg' data-ext-tech-regel='1'>{tr('Активуйте технічний профіль, щоб підключити технічний слот розширення й розблокувати його своїм passkey.', 'Activeer het technisch profiel om het technische slot van de extensie te koppelen en met uw passkey te ontgrendelen.')}</p>}
            {actief ? null : (
              <div className='ag-knoppen'>
                <button type='button' className='ag-knop ag-knop-primary' data-ext-tech-aan='1' onClick={() => openTechVenster('activeren')}><ShieldCheck size={16} aria-hidden='true' />{tr('Активувати', 'Activeren')}</button>
              </div>
            )}
          </header>
          {actief ? (
            <>
              <div className='ag2-paneel' data-paneel='extensie-technisch'>
                {/* HUB-05: de installatiehulp staat één keer (blok «Як користувач»); hier alleen de koppelstap van het technische slot. */}
                <BrowserExtensionPanel tr={tr} part='koppel' ruimte='technisch' autoKoppel={koppel === 'technisch'} agentsExtern={technisch as unknown as PanelAgents} reloadExtern={naActie} versie={versie} />
              </div>
              {technisch.length ? <ul className='ag-ext-lijst ag2-raster' data-lijst='extensie-technisch'>{technisch.map(blok)}</ul> : null}
              {diag ? (
                <p className='ag-rij ag2-rij is-let' data-ext-diag={diag.stand} role='status'>
                  <Bug size={16} aria-hidden='true' />
                  <span>{tr(DIAG_REGEL[diag.stand][0], DIAG_REGEL[diag.stand][1])}{diag.actief ? tr(' Зараз іде діагностика.', ' Er loopt nu een diagnose.') : ''}</span>
                  {diag.stand === 'niet-aanvraagbaar' || diag.stand === 'geweigerd'
                    ? <a className='ag-knop ag2-link-knop' data-ext-diag-pakket='1' href={`/downloads/${DIAG_PAKKET}`}>{tr('Пакет «діагностика»', 'Pakket «diagnose»')}</a>
                    : null}
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
